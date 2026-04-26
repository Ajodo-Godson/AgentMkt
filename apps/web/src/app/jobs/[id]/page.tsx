import { JobConsole } from "@/components/JobConsole";

interface JobPageProps {
  params: Promise<{ id: string }>;
}

export default async function JobPage({ params }: JobPageProps) {
  const { id } = await params;

  return <JobConsole initialJobId={id} />;
}
