import { LogoMark } from "./Brand";

export function LoadingScreen({ label = "업무 공간을 준비하고 있습니다" }: { label?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-logo"><LogoMark size={48} /></div>
      <strong>{label}</strong>
      <span>필지와 업무 정보를 안전하게 불러오는 중입니다.</span>
    </div>
  );
}
