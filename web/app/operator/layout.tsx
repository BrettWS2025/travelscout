/**
 * Operator portal layout.
 * Landing and organization routes stay public; signed-in operators use
 * /account for profile, inventory, and settings.
 */
export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
