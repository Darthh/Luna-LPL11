// Sign in with Apple has no fixed client secret: it is a JWT you sign with the
// private key (.p8) from your Apple Developer account, valid for at most six
// months. This makes one:
//
//   npm run apple:secret -- --team <TeamID> --key-id <KeyID> --client-id <ServicesID> --key AuthKey_XXXX.p8
//
// It prints the JWT and its expiry. Store it as the AuthAppleSecret SST
// secret (and AUTH_APPLE_SECRET locally), then set a reminder to run this
// again before it expires, or Apple sign-in stops working.
import { readFileSync } from "node:fs";
import { importPKCS8, SignJWT } from "jose";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const team = arg("team"), keyId = arg("key-id"), clientId = arg("client-id"), keyFile = arg("key");
if (!team || !keyId || !clientId || !keyFile) {
  console.error("Usage: npm run apple:secret -- --team <TeamID> --key-id <KeyID> --client-id <ServicesID> --key <AuthKey.p8>");
  process.exit(2);
}

const days = 180; // Apple's maximum
const key = await importPKCS8(readFileSync(keyFile, "utf8"), "ES256");
const expires = new Date(Date.now() + days * 86400_000);
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid: keyId })
  .setIssuer(team)
  .setSubject(clientId)
  .setAudience("https://appleid.apple.com")
  .setIssuedAt()
  .setExpirationTime(Math.floor(expires / 1000))
  .sign(key);

console.error(`Expires ${expires.toISOString().slice(0, 10)} (${days} days). Renew before then.`);
console.log(jwt);
