import InventoryDetailClient from "../InventoryDetailClient/page";


export function generateStaticParams() {
  return [
    { id: "1" },
    { id: "2" },
    { id: "3" },
    { id: "4" },
  ];
}

export default function InventoryDetailPage({ params }: { params: { id: string } }) {
  return <InventoryDetailClient id={params.id} />;
}
