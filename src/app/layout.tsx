import type { Metadata } from "next";
import { DM_Mono, Fraunces } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { AssistantDock } from "@/components/AssistantDock";
import "./globals.css";

const dmMono = DM_Mono({ weight: ["300", "400", "500"], subsets: ["latin"], variable: "--font-dm-mono" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "Network HQ - Avery Romain",
  description: "Personal CRM for networking",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmMono.variable} ${fraunces.variable}`}>
      <body>
        <Sidebar />
        <main className="min-h-screen" style={{ marginLeft: 196, padding: '24px 28px' }}>{children}</main>
        <AssistantDock />
      </body>
    </html>
  );
}
