import { HomeCards } from "@/components/home";

export default function Home() {
  return (
    <div className="container mx-auto p-4 sm:p-8 lg:p-20 space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Ministry Platform Charts & Metrics</h1>
        <p className="text-lg text-muted-foreground">Explore Ministry Platform data with visual dashboards and interactive tools</p>
      </div>

      <HomeCards />
    </div>
  );
}
