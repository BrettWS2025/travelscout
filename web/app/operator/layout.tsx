/**
 * Operator portal layout.
 * Landing and all operator routes are public for now — the signed-in
 * dashboard will be rebuilt later, so do not gate anything on auth here.
 */
export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
