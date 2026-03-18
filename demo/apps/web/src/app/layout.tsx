import type { Metadata } from "next"
import { Header } from "../components/Header"
import { Sidebar } from "../components/Sidebar"

export const metadata: Metadata = {
  title: "Acme Platform",
  description: "Internal platform dashboard",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <div className="flex">
          <Sidebar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  )
}
