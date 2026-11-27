import { useEffect, useRef, useState } from "react";

export function ReadinessCoin() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    const region = stage.current;
    if (!element || !region) return;

    let mounted = true;
    let dispose: (() => void) | undefined;
    void import("./readinessCoinScene").then(({ createReadinessCoin }) => {
      if (!mounted) return;
      dispose = createReadinessCoin(element, region, () => { if (mounted) setRendered(false); });
      setRendered(true);
    }).catch(() => {
      if (mounted) setRendered(false);
    });

    return () => {
      mounted = false;
      dispose?.();
    };
  }, []);

  return (
    <div className="overview-coin" aria-hidden="true">
      <div className="coin-stage" ref={stage} data-renderer={rendered ? "webgl" : "fallback"}>
        <div className="coin-still" hidden={rendered} />
      </div>
      <canvas className="coin-canvas" ref={canvas} data-visible={rendered} />
    </div>
  );
}
