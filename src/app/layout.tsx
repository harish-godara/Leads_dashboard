import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leads Viewer | Dashboard",
  description: "View, search, filter, and sort your leads database in real-time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-container">
          <header className="app-header">
            <h1>Leads Dashboard</h1>
            <p>Real-time view of your leads database</p>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
