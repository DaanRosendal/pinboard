import { getMetrics } from "@acme/shared"

export default async function DashboardPage() {
  const metrics = await getMetrics()
  return (
    <section>
      <h2>Dashboard</h2>
      <pre>{JSON.stringify(metrics, null, 2)}</pre>
    </section>
  )
}
