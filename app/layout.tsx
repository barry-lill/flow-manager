import "./globals.css";
import PurchaseOrderTableEnhancer from "./PurchaseOrderTableEnhancer";

export const metadata = {
  title: "Flow Manager",
  description: "SME flow management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PurchaseOrderTableEnhancer />
      </body>
    </html>
  );
}
