import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Devanagari } from "next/font/google";
import { Suspense } from "react";
import { Masthead } from "@/components/shell/Masthead";
import { NextSteps } from "@/components/shell/NextSteps";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const shoulders = Big_Shoulders({ variable: "--font-shoulders", subsets: ["latin"], weight: ["800"] });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexDeva = IBM_Plex_Sans_Devanagari({ variable: "--font-plex-deva", subsets: ["devanagari"], weight: ["700"] });

export const metadata: Metadata = {
  title: "BijliChori",
  description: "Real-time electricity theft detection for Uttar Pradesh smart meters",
};

const RESTORE_SHIFT = `try{if(localStorage.getItem("shift")==="night")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${shoulders.variable} ${plexSans.variable} ${plexMono.variable} ${plexDeva.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: RESTORE_SHIFT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <TooltipProvider delayDuration={150}>
          <Suspense fallback={<div className="h-[126px] border-b-2 border-foreground" />}>
            <Masthead />
          </Suspense>
          <NextSteps />
          <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 md:px-8">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  );
}
