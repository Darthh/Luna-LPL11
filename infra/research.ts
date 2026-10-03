/// <reference path="../.sst/platform/config.d.ts" />

export async function researchInfrastructure(sst: any, modelPermissions: any[]) {
  const pulumi = await import("../.sst/platform/node_modules/@pulumi/pulumi/index.js");
  const aws = await import("../.sst/platform/node_modules/@pulumi/aws/index.js");
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { resolve } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const account = await aws.getCallerIdentity({});
  const region = "us-east-1";
  const prefix = `luna-research-${$app.stage}-${account.accountId}`;
  const existingCatalog = spawnSync("aws", ["glue", "get-catalog", "--region", region, "--catalog-id", `${account.accountId}:s3tablescatalog`], { encoding: "utf8" });
  if (existingCatalog.status !== 0 && !existingCatalog.stderr.includes("EntityNotFoundException")) throw new Error("Cannot verify S3 Tables catalog: " + existingCatalog.stderr);
  const catalogStackName = `${prefix}-catalog`;
  const managedCatalog = spawnSync("aws", ["cloudformation", "describe-stacks", "--region", region, "--stack-name", catalogStackName], { encoding: "utf8" });
  // Reuse the account's existing catalog; never replace its access configuration.
  const catalogStack = existingCatalog.status === 0 && managedCatalog.status !== 0 ? undefined : new aws.cloudformation.Stack("ResearchCatalog", {
    name: catalogStackName,
    templateBody: JSON.stringify({ AWSTemplateFormatVersion: "2010-09-09", Resources: { Catalog: { Type: "AWS::Glue::Catalog", Properties: {
      Name: "s3tablescatalog", FederatedCatalog: { Identifier: `arn:aws:s3tables:${region}:${account.accountId}:bucket/*`, ConnectionName: "aws:s3tables" },
      CreateDatabaseDefaultPermissions: [{ Principal: { DataLakePrincipalIdentifier: "IAM_ALLOWED_PRINCIPALS" }, Permissions: ["ALL"] }],
      CreateTableDefaultPermissions: [{ Principal: { DataLakePrincipalIdentifier: "IAM_ALLOWED_PRINCIPALS" }, Permissions: ["ALL"] }],
    } } } }),
  }, { retainOnDelete: true });
  const bucket = new sst.aws.Bucket("ResearchDocuments", { transform: { bucket: { forceDestroy: false } } });
  const tables = new aws.s3tables.TableBucket("ResearchTables", { name: `${prefix}-history`, encryptionConfiguration: { sseAlgorithm: "AES256" } }, { retainOnDelete: true });
  const namespace = new aws.s3tables.Namespace("ResearchNamespace", { tableBucketArn: tables.arn, namespace: "research" });
  new aws.s3tables.Table("ResearchArtifacts", { tableBucketArn: tables.arn, namespace: namespace.namespace, name: "artifacts", format: "ICEBERG",
    encryptionConfiguration: { sseAlgorithm: "AES256" },
    metadata: { iceberg: { schema: { fields: ["id", "owner", "kind", "title", "created_at", "summary"].map(name => ({ name, type: "string", required: false })) } } },
  }, { retainOnDelete: true });
  const workgroup = new aws.athena.Workgroup("ResearchQueries", { name: `${prefix}-queries`, configuration: {
    enforceWorkgroupConfiguration: true, bytesScannedCutoffPerQuery: 100000000,
    resultConfiguration: { outputLocation: pulumi.interpolate`s3://${bucket.name}/athena/`, encryptionConfiguration: { encryptionOption: "SSE_S3" } },
    engineVersion: { selectedEngineVersion: "Athena engine version 3" },
  } });
  const vectors = new aws.cloudformation.Stack("ResearchVectors", {
    templateBody: JSON.stringify({ AWSTemplateFormatVersion: "2010-09-09", Resources: {
      Bucket: { Type: "AWS::S3Vectors::VectorBucket", DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain", Properties: { VectorBucketName: `${prefix}-vectors` } },
      Index: { Type: "AWS::S3Vectors::Index", DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain", Properties: {
        VectorBucketArn: { Ref: "Bucket" }, IndexName: "documents-v1", DataType: "float32", Dimension: 1024, DistanceMetric: "cosine", MetadataConfiguration: { NonFilterableMetadataKeys: ["text", "title", "createdAt"] },
      } },
    }, Outputs: { IndexArn: { Value: { Ref: "Index" } } } }),
  });
  const catalog = `${account.accountId}:s3tablescatalog/${prefix}-history`;
  const environment = {
    BEDROCK_REGION: region, RESEARCH_BUCKET: bucket.name, RESEARCH_INDEX_ARN: vectors.outputs.apply(v => v.IndexArn),
    RESEARCH_WORKGROUP: workgroup.name, RESEARCH_TABLE_CATALOG: `s3tablescatalog/${prefix}-history`,
  };
  const dataPermissions = [
    { actions: ["s3:GetObject", "s3:PutObject"], resources: [pulumi.interpolate`${bucket.arn}/*`] },
    { actions: ["s3:ListBucket", "s3:GetBucketLocation", "s3:ListBucketMultipartUploads"], resources: [bucket.arn] },
    { actions: ["s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"], resources: [pulumi.interpolate`${bucket.arn}/athena/*`] },
    { actions: ["s3vectors:QueryVectors", "s3vectors:GetVectors", "s3vectors:PutVectors"], resources: [environment.RESEARCH_INDEX_ARN] },
    { actions: ["bedrock:InvokeModel"], resources: ["arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0"] },
    { actions: ["athena:StartQueryExecution", "athena:GetQueryExecution", "athena:GetQueryResults"], resources: [workgroup.arn] },
    { actions: ["glue:GetCatalog", "glue:GetDatabase", "glue:GetTable", "glue:GetTables", "glue:UpdateTable"], resources: [
      `arn:aws:glue:${region}:${account.accountId}:catalog`, `arn:aws:glue:${region}:${account.accountId}:catalog/s3tablescatalog`,
      `arn:aws:glue:${region}:${account.accountId}:catalog/s3tablescatalog/${prefix}-history`,
      `arn:aws:glue:${region}:${account.accountId}:database/s3tablescatalog/${prefix}-history/research`,
      `arn:aws:glue:${region}:${account.accountId}:table/s3tablescatalog/${prefix}-history/research/artifacts`,
    ] },
    { actions: ["s3tables:GetTableBucket", "s3tables:GetNamespace", "s3tables:GetTable", "s3tables:GetTableMetadataLocation", "s3tables:GetTableData", "s3tables:PutTableData", "s3tables:UpdateTableMetadataLocation", "s3tables:ListNamespaces", "s3tables:ListTables"], resources: [tables.arn, pulumi.interpolate`${tables.arn}/*`] },
  ];
  const agentRole = new aws.iam.Role("FinancialAgentRole", { assumeRolePolicy: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "bedrock-agentcore.amazonaws.com" }, Action: "sts:AssumeRole", Condition: { StringEquals: { "aws:SourceAccount": account.accountId }, ArnLike: { "aws:SourceArn": `arn:aws:bedrock-agentcore:${region}:${account.accountId}:*` } } }] }) });
  const agentPolicy = new aws.iam.RolePolicy("FinancialAgentPolicy", { role: agentRole.name, policy: pulumi.all([...modelPermissions, ...dataPermissions,
    { actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], resources: [`arn:aws:logs:${region}:${account.accountId}:log-group:/aws/bedrock-agentcore/*`] },
  ].map(p => pulumi.all([pulumi.output(p.actions), pulumi.output(p.resources), pulumi.output(p.conditions || [])]).apply(([actions, resources, conditions]) => ({
    Effect: "Allow", Action: actions, Resource: resources, ...(conditions.length ? { Condition: { StringEquals: { "bedrock-mantle:Model": ["google.gemma-4-31b", "qwen.qwen3-235b-a22b-2507"] } } } : {}),
  })))).apply(Statement => JSON.stringify({ Version: "2012-10-17", Statement })) });
  const codeHash = createHash("sha256").update(readFileSync(".sst/agentcore/app.js")).digest("hex").slice(0, 20);
  const code = new aws.s3.BucketObjectv2("FinancialAgentCode", { bucket: bucket.name, key: `agentcore/${codeHash}.zip`,
    source: new pulumi.asset.AssetArchive({ "app.js": new pulumi.asset.FileAsset(resolve(".sst/agentcore/app.js")) }),
  });
  const runtime = new aws.cloudformation.Stack("FinancialAgentRuntime", {
    templateBody: pulumi.all([bucket.name, code.key, agentRole.arn, pulumi.output(environment)]).apply(([bucketName, key, roleArn, env]) => JSON.stringify({ AWSTemplateFormatVersion: "2010-09-09", Resources: {
      Runtime: { Type: "AWS::BedrockAgentCore::Runtime", Properties: {
        AgentRuntimeName: `luna_financial_${$app.stage.replaceAll("-", "_")}`, AgentRuntimeArtifact: { CodeConfiguration: { Code: { S3: { Bucket: bucketName, Prefix: key } }, Runtime: "NODE_22", EntryPoint: ["app.js"] } },
        RoleArn: roleArn, NetworkConfiguration: { NetworkMode: "PUBLIC" }, EnvironmentVariables: env,
        LifecycleConfiguration: { IdleRuntimeSessionTimeout: 300, MaxLifetime: 1800 },
      } },
    }, Outputs: { RuntimeArn: { Value: { "Fn::GetAtt": ["Runtime", "AgentRuntimeArn"] } } } })),
  }, { dependsOn: [agentPolicy, code, ...(catalogStack ? [catalogStack] : [])] });
  const runtimeArn = runtime.outputs.apply(v => v.RuntimeArn);
  const extractionProject = new aws.cloudformation.Stack("ResearchExtraction", {
    templateBody: JSON.stringify({ AWSTemplateFormatVersion: "2010-09-09", Resources: {
      Project: { Type: "AWS::Bedrock::DataAutomationProject", Properties: {
        ProjectName: `${prefix}-extraction`, ProjectType: "ASYNC", StandardOutputConfiguration: {},
      } },
    }, Outputs: { ProjectArn: { Value: { "Fn::GetAtt": ["Project", "ProjectArn"] } } } }),
  });
  const extractionArn = extractionProject.outputs.apply(v => v.ProjectArn);
  const invokePermissions = [{ actions: ["bedrock-agentcore:InvokeAgentRuntime"], resources: [runtimeArn, pulumi.interpolate`${runtimeArn}/runtime-endpoint/*`] }];
  const worker = new sst.aws.Function("ResearchWorkflow", {
    handler: "services/research/workflow.handler", runtime: "nodejs22.x", timeout: "120 seconds", memory: "1024 MB",
    durable: { timeout: "2 hours", retention: "7 days" }, concurrency: { reserved: 2 },
    environment: { ...environment, AGENTCORE_RUNTIME_ARN: runtimeArn, BDA_PROJECT_ARN: extractionArn, BDA_PROFILE_ARN: `arn:aws:bedrock:${region}:${account.accountId}:data-automation-profile/us.data-automation-v1` },
    permissions: [...dataPermissions, ...invokePermissions,
      { actions: ["bedrock:InvokeDataAutomationAsync"], resources: [`arn:aws:bedrock:*:${account.accountId}:data-automation-profile/*`, extractionArn] },
      { actions: ["bedrock:GetDataAutomationStatus"], resources: [`arn:aws:bedrock:*:${account.accountId}:data-automation-invocation/*`] },
    ],
  });
  return { environment: { ...environment, AGENTCORE_RUNTIME_ARN: runtimeArn, RESEARCH_FUNCTION_ARN: worker.nodes.function.qualifiedArn },
    permissions: [...dataPermissions, ...invokePermissions, { actions: ["lambda:InvokeFunction"], resources: [worker.nodes.function.qualifiedArn] }],
    outputs: { agentRuntimeArn: runtimeArn, researchBucket: bucket.name, researchTableCatalog: catalog, researchWorkflowArn: worker.nodes.function.qualifiedArn },
  };
}
