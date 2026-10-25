import { DashboardHeader } from '@/components/features/dashboard/Header';

export default function DashboardPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-2">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm">You are signed in.</p>
      </main>
    </div>
  );
}
