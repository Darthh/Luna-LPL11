import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

// A renewable local profile must take precedence over expired keys in .env.local.
// Hosted runtimes always use their execution role and its automatic renewal.
export function awsClientOptions(env = process.env) {
  const profile = env.BEDROCK_AWS_PROFILE;
  const hosted = env.AWS_LAMBDA_FUNCTION_NAME || env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  return {
    region: env.BEDROCK_REGION || env.AWS_REGION || "us-east-1",
    maxAttempts: 3,
    ...(profile && !hosted ? { credentials: fromNodeProviderChain({ profile }) } : {}),
  };
}

export function awsChatError(error) {
  const name = error?.name;
  if (["ExpiredTokenException", "ExpiredToken", "InvalidClientTokenId", "UnrecognizedClientException", "InvalidSignatureException", "CredentialsProviderError"].includes(name)) {
    return "AWS authentication is unavailable or expired. Renew the server's AWS sign-in; for persistent hosting, use an AWS execution role with automatically refreshed credentials.";
  }
  if (name === "AccessDeniedException") return "AWS denied model access. The server's IAM role needs permission to invoke this model and its cross-region inference profile.";
  if (name === "ThrottlingException" || name === "ServiceUnavailableException") return "AWS model capacity is temporarily unavailable. Try again shortly.";
  return "This AWS model could not answer. Check the server's model configuration and AWS access.";
}
