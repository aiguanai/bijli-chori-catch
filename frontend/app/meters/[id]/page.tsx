import { Suspense } from "react";
import { MeterFile } from "@/components/meter/MeterFile";
import { Warming } from "@/components/shell/States";

export default function MeterPage() {
  return (
    <Suspense fallback={<Warming>Opening the file</Warming>}>
      <MeterFile />
    </Suspense>
  );
}
