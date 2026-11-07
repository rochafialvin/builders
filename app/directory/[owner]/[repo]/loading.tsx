import { HeaderShell } from "../../../components/shell";
import { LoadingNote, Skeleton } from "../../../components/skeleton";

/** A repo page's skeleton: the head with its avatar, then the two community sections. */
export default function Loading() {
  return (
    <>
      <HeaderShell active="directory" />
      <main id="main-content" className="dx-page rp-page">
        <LoadingNote />
        <Skeleton height={12} width={200} style={{ marginBottom: 20 }} />
        <div className="rp-head">
          <Skeleton height={56} width={56} round />
          <div className="rp-head-copy">
            <Skeleton height={30} width={320} style={{ marginBottom: 12 }} />
            <Skeleton height={20} width={220} style={{ marginBottom: 14 }} />
            <Skeleton height={15} width="70%" style={{ marginBottom: 18 }} />
            <Skeleton height={32} width={260} style={{ borderRadius: 7 }} />
          </div>
        </div>
        <div className="rp-community">
          <Skeleton height={140} style={{ borderRadius: 12 }} />
          <Skeleton height={220} style={{ borderRadius: 12 }} />
        </div>
      </main>
    </>
  );
}
