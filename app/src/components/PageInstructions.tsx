"use client";

interface PageInstructionsProps {
  title: string;
  description: string;
  steps?: string[];
  children?: React.ReactNode;
}

export function PageInstructions({
  title,
  description,
  steps,
  children,
}: PageInstructionsProps) {
  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-slate-800">
        {title}
      </h2>
      <p className="mb-2 text-slate-700">{description}</p>
      {steps && steps.length > 0 && (
        <ul className="mb-2 list-inside list-disc space-y-1 text-slate-700">
          {steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}
