import { HomeForm } from "../home-form";

export default function StartPage() {
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] lg:gap-16">
      <div className="rise max-w-[28rem] pt-2">
        <h1 className="text-[clamp(2.6rem,5vw,4.2rem)] leading-[0.95] tracking-tight">Start a run</h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--muted)]">
          Set the task and the USDC budget. Demo spends nothing. Live stops for your confirmation.
        </p>
      </div>
      <div className="rise delay-1">
        <HomeForm />
      </div>
    </div>
  );
}
