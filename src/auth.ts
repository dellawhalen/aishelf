import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { isAllowedGithubAccount } from "@/lib/workspace-authorization";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.VERCEL === "1" || process.env.AUTH_TRUST_HOST === "true",
  providers: [GitHub],
  pages: { signIn: "/sign-in" },
  callbacks: {
    signIn({ account }) {
      return isAllowedGithubAccount(
        account?.provider,
        account?.providerAccountId,
        process.env.AISHELF_ALLOWED_USER_IDS,
      );
    },
    jwt({ token, account }) {
      if (account?.provider === "github") {
        token.sub = account.providerAccountId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.sub === "string") {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
