import Link from "next/link";
import { Empty } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="container page">
      <Empty title="페이지를 찾을 수 없어요" action={<Link href="/" className="btn btn-primary">홈으로</Link>} />
    </main>
  );
}
