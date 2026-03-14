// app/account/[id]/layout.tsx
export const dynamic = 'force-dynamic';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}