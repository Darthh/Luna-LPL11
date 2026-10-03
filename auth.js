import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig, googleEnabled, appleEnabled } from "@/auth.config";

// Google needs OAuth credentials the user must create themselves (see
// README "Accounts" section). Whether it is registered is decided in
// auth.config.js, which middleware shares; re-exported here so the existing
// importers of "@/auth" keep working.
export { googleEnabled, appleEnabled };

// Spreads auth.config.js (which middleware also uses) and adds the parts that
// need the database: the Prisma adapter and the Credentials provider.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // session ({ strategy: "jwt" }) and pages come from authConfig. JWT matters
  // here: the Credentials provider only supports JWT sessions, and it is also
  // what lets middleware verify a session without touching the database.
  providers: [
    ...authConfig.providers,
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().trim().toLowerCase();
        const password = credentials?.password?.toString();
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null; // Google-only account, no password set

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) token.id = user.id;
      // Client called update({ name, image }) after a profile edit - merge
      // the new values into the token so session() reflects them without
      // requiring a fresh sign-in.
      if (trigger === "update" && session) {
        if (session.name !== undefined) token.name = session.name;
        if (session.image !== undefined) token.picture = session.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id;
      return session;
    },
  },
});
