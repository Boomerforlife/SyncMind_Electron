import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/login",
    },
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Invalid credentials");
                }

                let user = await prisma.user.findUnique({
                    where: { email: credentials.email }
                });

                if (!user) {
                    // Auto-register functionality for demo purposes
                    const hashedPassword = await bcrypt.hash(credentials.password, 10);
                    user = await prisma.user.create({
                        data: {
                            email: credentials.email,
                            name: credentials.email.split("@")[0],
                            hashedPassword
                        }
                    });
                } else {
                    // Verify password
                    if (!user.hashedPassword) {
                        throw new Error("Invalid credentials. Please use the correct originally registered password if you are trying to sign in.");
                    }
                    const isPasswordValid = await bcrypt.compare(credentials.password, user.hashedPassword);
                    if (!isPasswordValid) {
                        throw new Error("Invalid password");
                    }
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                };
            }
        })
    ],
    callbacks: {
        async session({ session, token }) {
            if (session.user && token.sub) {
                // @ts-ignore
                session.user.id = token.sub;
            }
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.sub = user.id;
            }
            return token;
        }
    }
};
