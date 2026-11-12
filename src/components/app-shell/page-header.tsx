export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-8 grid max-w-3xl gap-2">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-[2.15rem] sm:leading-[1.1]">
        {title}
      </h1>
      {description && <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}
