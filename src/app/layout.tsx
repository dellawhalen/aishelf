import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIShelf | Brand visibility",
  description: "A transparent view of how AI shopping experiences understand your brand.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}