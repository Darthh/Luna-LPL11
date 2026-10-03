# Google and Apple sign-up

The sign-up and sign-in modals offer both providers. Auth.js creates the account
through the existing Prisma adapter on a user's first successful OAuth sign-in.
Email/password registration remains available. Unconfigured providers are shown
disabled until configured; no placeholder credentials are used.
The app discovers configured providers through `/api/auth/providers`.

Both flows require a working accounts database and `AUTH_SECRET`. Keep all
provider values in ignored local environment files or the deployment's secret
configuration. Never put them in `NEXT_PUBLIC_` variables or commit them.

## Google

1. In Google Cloud Console, configure Google Auth Platform branding, audience,
   and consent for your application. Add test users while the app is in testing.
2. Create an OAuth client with application type **Web application**.
3. Register the public origin and authorized redirect URI:
   `https://YOUR_DOMAIN/api/auth/callback/google`. For local development, also
   register `http://localhost:3000/api/auth/callback/google`.
4. Configure `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` on the app server.
5. Restart locally or redeploy, then confirm `google` appears in
   `/api/auth/providers` and test account creation and subsequent sign-in.

## Apple

1. In your Apple Developer account, enable **Sign in with Apple** on a primary
   App ID. Create a Services ID for the website and associate it with that App ID.
2. Configure the website domain and return URL:
   `https://YOUR_DOMAIN/api/auth/callback/apple`.
3. Create a Sign in with Apple key. Generate the client-secret JWT privately
   using that key, your Team ID, key ID, and the Services ID as its subject.
   Follow Apple's JWT expiration requirements and rotate before it expires.
4. Set `AUTH_APPLE_ID` to the Services ID and `AUTH_APPLE_SECRET` to that JWT.
5. Redeploy on the registered HTTPS domain. Apple cannot use a localhost/HTTP
   callback. Confirm `apple` appears in `/api/auth/providers` and test on HTTPS.

SST maps these variables to optional `AuthGoogleId`, `AuthGoogleSecret`,
`AuthAppleId`, and `AuthAppleSecret` values. Empty values leave that provider off.
This code change does not create developer applications or configure live values.

Keep Auth.js's default account-linking protection. An email/password account
with the same email is not automatically linked to a different OAuth identity.
Do not enable `allowDangerousEmailAccountLinking` to bypass that check.

Official references: [Google provider](https://authjs.dev/getting-started/providers/google),
[Apple provider](https://authjs.dev/getting-started/providers/apple),
[Apple Sign in with Apple](https://developer.apple.com/sign-in-with-apple/get-started/).
