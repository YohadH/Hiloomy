import { buildHeroBannerDoc, type BannerLocale } from "./hero-banner-doc";

// Animated hero banner for /welcome. Server-rendered: the two documents are
// built as strings and handed to <iframe srcdoc>, so there is no client
// component, no hydration cost and no layout shift.
//
// Two iframes rather than one responsive document: portrait isn't the
// landscape composition squeezed, it's a different arrangement (fixed
// headline band + one swapping content layer). CSS picks which one shows at
// the 640px breakpoint. The off-breakpoint iframe still loads — but it is
// display:none, so its IntersectionObserver reports it as not intersecting
// and its timeline never starts. It costs one parse, not a running loop.

export function HeroBanner({ locale }: { locale: BannerLocale }) {
  const { desktop, mobile } = buildHeroBannerDoc(locale);
  const title = locale === "he" ? "Hiloomy — הדגמה מונפשת של המוצר" : "Hiloomy — animated product demo";

  return (
    <div
      className="overflow-hidden rounded-[20px] border"
      style={{ borderColor: "rgba(32,30,29,.12)", boxShadow: "0 30px 70px -28px rgba(18,52,31,.35)" }}
    >
      <iframe
        srcDoc={desktop}
        title={title}
        scrolling="no"
        className="hidden aspect-[16/9] w-full border-0 sm:block"
      />
      <iframe
        srcDoc={mobile}
        title={title}
        scrolling="no"
        className="block aspect-[3/4] w-full border-0 sm:hidden"
      />
    </div>
  );
}
