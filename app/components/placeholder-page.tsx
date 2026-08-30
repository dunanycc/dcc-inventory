import { PageHeading } from "./page-heading";
export function PlaceholderPage({ title, description, heading, detail }: { title: string; description: string; heading: string; detail: string }) {
  return <><PageHeading eyebrow="DCC Inventory" title={title} description={description}/><section className="empty-panel"><span className="status-pill">Coming next</span><h2>{heading}</h2><p>{detail}</p></section></>;
}
