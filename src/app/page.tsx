import Link from "next/link";
import Image from "next/image";
import * as fs from "node:fs";
import * as path from "node:path";
import { ArrowRight, Sparkles, ChefHat, Smartphone, Flame, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SmoothScroll } from "@/components/ui/smooth-scroll";
import { Reveal } from "@/components/ui/reveal";

export default function HomePage() {
  const root = process.cwd();
  const hasHeroVideo = fs.existsSync(path.resolve(root, "public/media/hero.mp4"));
  const hasHeroPhoto = fs.existsSync(path.resolve(root, "public/images/hero.jpg"));
  const hasHeroPoster = fs.existsSync(path.resolve(root, "public/media/hero-poster.jpg"));
  const hasStoryPhoto = fs.existsSync(path.resolve(root, "public/images/story.jpg"));

  const hasDalMakhani = fs.existsSync(path.resolve(root, "public/images/dishes/dal-makhani.jpg"));
  const hasButterChicken = fs.existsSync(path.resolve(root, "public/images/dishes/butter-chicken.jpg"));
  const hasBiryani = fs.existsSync(path.resolve(root, "public/images/dishes/gosht-dum-biryani.jpg"));
  const hasTruffleNaan = fs.existsSync(path.resolve(root, "public/images/dishes/truffle-cheddar-naan.jpg"));

  return (
    <SmoothScroll>
      <div className="flex flex-col min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
        {/* Editorial Navigation */}
        <nav className="sticky top-0 z-40 bg-[var(--bg-app)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] px-4 sm:px-8 py-3.5 transition-colors">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <Link href="/" className="flex items-baseline gap-2.5 group">
              <span className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[var(--primary)] group-hover:opacity-90 transition-opacity">
                Masala Lane
              </span>
              <span className="hidden sm:inline text-[11px] font-mono tracking-widest text-[var(--text-muted)] uppercase">
                Bengaluru
              </span>
            </Link>

            <div className="flex items-center gap-3 sm:gap-4">
              <Link
                href="/demo"
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors min-h-[44px]"
              >
                <span>Live Showcase</span>
              </Link>
              <Link
                href="/kitchen"
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors min-h-[44px]"
              >
                <span>Kitchen Display</span>
              </Link>
              <Link
                href="/t/demo-table-7"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold tracking-wide uppercase transition-all shadow-xs min-h-[44px]"
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>Table 7 Order</span>
              </Link>
            </div>
          </div>
        </nav>

        {/* 00 / HERO SECTION (Full-bleed Warm Food Photography with WCAG AA Dark Overlay) */}
        <section className="relative min-h-[85vh] sm:min-h-[90vh] flex items-center justify-center overflow-hidden px-4 sm:px-8 py-24 sm:py-32">
          {/* Full-bleed Background Photography or Video */}
          <div className="absolute inset-0 z-0">
            {hasHeroVideo ? (
              <video
                src="/media/hero.mp4"
                poster={hasHeroPoster ? "/media/hero-poster.jpg" : "/media/hero-poster.svg"}
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full object-cover object-center filter brightness-[0.88] saturate-[1.1]"
              />
            ) : hasHeroPhoto ? (
              <Image
                src="/images/hero.jpg"
                alt="Warm Indian feast featuring tandoor rotis, slow-simmered gravies, and aromatic spices"
                fill
                priority
                sizes="100vw"
                className="object-cover object-center filter brightness-[0.88] saturate-[1.1]"
              />
            ) : (
              <Image
                src="/images/hero-placeholder.svg"
                alt="Warm Indian feast featuring tandoor rotis, slow-simmered gravies, and aromatic spices"
                fill
                priority
                sizes="100vw"
                unoptimized
                className="object-cover object-center filter brightness-[0.88] saturate-[1.1]"
              />
            )}
            {/* Deep Ember Gradient Overlay for Flawless WCAG AA Text Contrast */}
            <div className="absolute inset-0 overlay-hero z-10" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#2E2723] via-[#2E2723]/60 to-transparent z-10" />
          </div>

          {/* Hero Content with Scroll Reveal */}
          <div className="relative z-20 max-w-5xl mx-auto text-center space-y-6 sm:space-y-8">
            <Reveal delay={0.05}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[#FAF7F2]">
                <Sparkles className="h-3.5 w-3.5 text-[#D97706]" />
                <span className="eyebrow text-[11px] text-[#FAF7F2]">
                  00 / An Odyssey of Smoke & Spice
                </span>
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <h1 className="display-heading text-[#FAF7F2] uppercase font-bold tracking-tight drop-shadow-sm">
                Fired by Charcoal, Rooted in Heritage.
              </h1>
            </Reveal>

            <Reveal delay={0.25}>
              <p className="max-w-2xl mx-auto text-base sm:text-lg text-[#EAE2D8] font-sans font-normal leading-relaxed">
                Welcome to <span className="font-serif italic text-[#FAF7F2] font-semibold">Masala Lane</span>. An editorial celebration of North-West Frontier flavours—braised slowly over glowing embers, served with seamless digital hospitality.
              </p>
            </Reveal>

            <Reveal delay={0.35}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                <Link
                  href="/demo"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-[#D97706] hover:bg-[#B45309] text-white text-sm font-semibold tracking-wider uppercase transition-all shadow-md min-h-[48px]"
                >
                  <span>Explore Live Showcase</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/t/demo-table-7"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-[#FAF7F2]/15 hover:bg-[#FAF7F2]/25 backdrop-blur-md border border-[#FAF7F2]/30 text-[#FAF7F2] text-sm font-semibold tracking-wider uppercase transition-all min-h-[48px]"
                >
                  <Smartphone className="h-4 w-4" />
                  <span>Simulate Guest Order (Table 7)</span>
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Editorial Infinite Horizontal Marquee Ticker */}
        <div className="border-y border-[var(--border-subtle)] bg-[var(--bg-subtle)]/80 py-3.5 overflow-hidden select-none">
          <div className="marquee flex items-center gap-8 whitespace-nowrap text-xs font-mono font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
            <span>Clay Tandoor Roasts</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>24-Hour Old Delhi Dal Makhani</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>Awadhi Dum Pukht Biryani</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>Slow Charcoal Embers</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>Artisanal Truffle Kulchas</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>Zero-App Table Ordering</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>Realtime Kitchen Dispatch</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            {/* Seamless duplicate sequence */}
            <span>Clay Tandoor Roasts</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>24-Hour Old Delhi Dal Makhani</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>Awadhi Dum Pukht Biryani</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>Slow Charcoal Embers</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>Artisanal Truffle Kulchas</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>Zero-App Table Ordering</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
            <span>Realtime Kitchen Dispatch</span>
            <span className="text-[var(--accent)] font-bold">✦</span>
          </div>
        </div>

        {/* 01 / THE CRAFT & PHILOSOPHY (Editorial Storytelling) */}
        <section className="py-20 sm:py-28 px-4 sm:px-8 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <Reveal className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2">
                <span className="eyebrow text-[var(--accent)] font-semibold">
                  01 / Tandoor & Time
                </span>
              </div>

              <h2 className="display-subheading text-[var(--text-primary)] font-bold">
                Clay Ovens, Slow Embers & Generous Hospitality.
              </h2>

              <div className="space-y-4 text-base text-[var(--text-secondary)] leading-relaxed">
                <p>
                  At Masala Lane, recipes are not engineered for haste. Our black lentils simmer for twenty-four uninterrupted hours over dying embers; our meats rest in stone-ground fenugreek, mustard oil, and hung curd before meeting the scorching heart of a clay tandoor.
                </p>
                <p>
                  We marry ancient cooking techniques with effortless modern flow. Guests scan a table code, explore provenance and allergens at their own pace, and let our chefs orchestrate an authentic feast with zero friction.
                </p>
              </div>

              <hr className="hairline" />

              <div className="pt-2 flex items-center gap-8">
                <div>
                  <span className="font-serif text-3xl font-bold text-[var(--primary)]">24h</span>
                  <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
                    Charcoal Simmer
                  </p>
                </div>
                <div className="h-8 w-px bg-[var(--border-subtle)]" />
                <div>
                  <span className="font-serif text-3xl font-bold text-[var(--primary)]">480°C</span>
                  <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
                    Clay Tandoor
                  </p>
                </div>
                <div className="h-8 w-px bg-[var(--border-subtle)]" />
                <div>
                  <span className="font-serif text-3xl font-bold text-[var(--primary)]">100%</span>
                  <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
                    App-Free Order
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.2} className="lg:col-span-6">
              <div className="relative aspect-[4/3] rounded-[var(--radius-xl)] overflow-hidden shadow-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
                <Image
                  src={hasStoryPhoto ? "/images/story.jpg" : "/images/story-placeholder.svg"}
                  alt="Slow simmered rich butter gravy with fresh cream swirl and fenugreek"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  unoptimized={!hasStoryPhoto}
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <span className="eyebrow text-[10px] text-amber-300 font-semibold">
                    Heritage Recipe No. 04
                  </span>
                  <p className="font-serif text-sm italic font-medium">
                    The Old Delhi Makhani reduction, perfected since 1947.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 02 / CHEF'S SIGNATURES (Curated Photography Grid) */}
        <section className="py-20 sm:py-28 px-4 sm:px-8 bg-[var(--bg-subtle)]/60 border-y border-[var(--border-subtle)]">
          <div className="max-w-7xl mx-auto space-y-12">
            <Reveal className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2">
                <span className="eyebrow text-[var(--accent)] font-semibold">
                  02 / Chef&apos;s Signatures
                </span>
                <h2 className="display-subheading text-[var(--text-primary)] font-bold">
                  Flavours Carved in Ember.
                </h2>
              </div>
              <Link
                href="/t/demo-table-7"
                className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors min-h-[44px]"
              >
                <span>View Complete Table Menu</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Reveal>

            {/* 4 Photo-led Editorial Dish Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Dish 1 */}
              <Reveal delay={0.05}>
                <article className="group flex flex-col rounded-[var(--radius-lg)] overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm hover:shadow-md transition-all">
                  <div className="relative aspect-[4/3] w-full bg-[var(--bg-subtle)] overflow-hidden">
                    <Image
                      src={hasDalMakhani ? "/images/dishes/dal-makhani.jpg" : "/images/dish-placeholder.svg"}
                      alt="24-Hour Old Delhi Dal Makhani"
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      unoptimized={!hasDalMakhani}
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute top-3 left-3">
                      <Badge variant="secondary" size="sm" className="font-mono text-[10px] bg-emerald-800 text-white">
                        VEG
                      </Badge>
                    </div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-serif text-lg font-bold text-[var(--text-primary)]">
                          Dal Makhani 24h
                        </h3>
                        <span className="font-sans font-bold text-sm text-[var(--primary)]">
                          ₹380
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        Overnight simmered urad dal, cultured white butter, and slow charcoal smokiness.
                      </p>
                    </div>
                    <Link
                      href="/t/demo-table-7"
                      className="inline-flex items-center justify-between w-full pt-3 border-t border-[var(--border-subtle)] text-xs font-semibold text-[var(--primary)] group-hover:text-[var(--primary-hover)] min-h-[44px]"
                    >
                      <span>Order for Table</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </article>
              </Reveal>

              {/* Dish 2 */}
              <Reveal delay={0.15}>
                <article className="group flex flex-col rounded-[var(--radius-lg)] overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm hover:shadow-md transition-all">
                  <div className="relative aspect-[4/3] w-full bg-[var(--bg-subtle)] overflow-hidden">
                    <Image
                      src={hasButterChicken ? "/images/dishes/butter-chicken.jpg" : "/images/dish-placeholder.svg"}
                      alt="Smoked Burrata Butter Chicken"
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      unoptimized={!hasButterChicken}
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute top-3 left-3">
                      <Badge variant="secondary" size="sm" className="font-mono text-[10px] bg-amber-950 text-white">
                        NON-VEG
                      </Badge>
                    </div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-serif text-lg font-bold text-[var(--text-primary)]">
                          Burrata Butter Chicken
                        </h3>
                        <span className="font-sans font-bold text-sm text-[var(--primary)]">
                          ₹540
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        Tandoori chicken morsels in velvet tomato gravy, crowned with artisanal wood-smoked burrata.
                      </p>
                    </div>
                    <Link
                      href="/t/demo-table-7"
                      className="inline-flex items-center justify-between w-full pt-3 border-t border-[var(--border-subtle)] text-xs font-semibold text-[var(--primary)] group-hover:text-[var(--primary-hover)] min-h-[44px]"
                    >
                      <span>Order for Table</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </article>
              </Reveal>

              {/* Dish 3 */}
              <Reveal delay={0.25}>
                <article className="group flex flex-col rounded-[var(--radius-lg)] overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm hover:shadow-md transition-all">
                  <div className="relative aspect-[4/3] w-full bg-[var(--bg-subtle)] overflow-hidden">
                    <Image
                      src={hasBiryani ? "/images/dishes/gosht-dum-biryani.jpg" : "/images/dish-placeholder.svg"}
                      alt="Dum Pukht Awadhi Biryani"
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      unoptimized={!hasBiryani}
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute top-3 left-3">
                      <Badge variant="secondary" size="sm" className="font-mono text-[10px] bg-amber-950 text-white">
                        NON-VEG
                      </Badge>
                    </div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-serif text-lg font-bold text-[var(--text-primary)]">
                          Dum Pukht Biryani
                        </h3>
                        <span className="font-sans font-bold text-sm text-[var(--primary)]">
                          ₹620
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        Fragrant long-grain aged basmati, saffron infusion, sealed and cooked under dough crust.
                      </p>
                    </div>
                    <Link
                      href="/t/demo-table-7"
                      className="inline-flex items-center justify-between w-full pt-3 border-t border-[var(--border-subtle)] text-xs font-semibold text-[var(--primary)] group-hover:text-[var(--primary-hover)] min-h-[44px]"
                    >
                      <span>Order for Table</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </article>
              </Reveal>

              {/* Dish 4 */}
              <Reveal delay={0.35}>
                <article className="group flex flex-col rounded-[var(--radius-lg)] overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm hover:shadow-md transition-all">
                  <div className="relative aspect-[4/3] w-full bg-[var(--bg-subtle)] overflow-hidden">
                    <Image
                      src={hasTruffleNaan ? "/images/dishes/truffle-cheddar-naan.jpg" : "/images/dish-placeholder.svg"}
                      alt="Truffle Cheese Kulcha"
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      unoptimized={!hasTruffleNaan}
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute top-3 left-3">
                      <Badge variant="secondary" size="sm" className="font-mono text-[10px] bg-emerald-800 text-white">
                        VEG
                      </Badge>
                    </div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-serif text-lg font-bold text-[var(--text-primary)]">
                          Truffle Cheese Kulcha
                        </h3>
                        <span className="font-sans font-bold text-sm text-[var(--primary)]">
                          ₹220
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        Stuffed with sharp cheddar and mozzarella, brushed with black truffle butter from the tandoor.
                      </p>
                    </div>
                    <Link
                      href="/t/demo-table-7"
                      className="inline-flex items-center justify-between w-full pt-3 border-t border-[var(--border-subtle)] text-xs font-semibold text-[var(--primary)] group-hover:text-[var(--primary-hover)] min-h-[44px]"
                    >
                      <span>Order for Table</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </article>
              </Reveal>
            </div>
          </div>
        </section>

        {/* 03 / DARK "EMBER" SECTION STYLE (Espresso #2E2723, Cream #FAF7F2, Saffron #D97706) */}
        <section className="ember-section py-24 sm:py-32 px-4 sm:px-8 border-y border-[var(--ember-border)]">
          <div className="max-w-7xl mx-auto space-y-16">
            <Reveal className="max-w-3xl space-y-4">
              <span className="eyebrow text-[#D97706] font-semibold">
                03 / The DinePulse Experience
              </span>
              <h2 className="display-subheading font-bold text-[#FAF7F2]">
                No Apps. No Waiting. Just Instant Hospitality.
              </h2>
              <p className="text-base sm:text-lg text-[#D1C5B8] leading-relaxed">
                DinePulse turns guest smartphones into responsive dining terminals and delivers live ticket dispatch to kitchen stations with zero hardware friction.
              </p>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Pillar 1 */}
              <Reveal delay={0.1} className="p-8 rounded-[var(--radius-xl)] bg-[#3B332E] border border-[var(--ember-border)] space-y-4">
                <div className="h-12 w-12 rounded-full bg-[#D97706]/15 flex items-center justify-center text-[#D97706]">
                  <Smartphone className="h-6 w-6" />
                </div>
                <span className="eyebrow text-[11px] text-[#D1C5B8] font-semibold">
                  03.1 / Instant Table Tap
                </span>
                <h3 className="font-serif text-xl font-bold text-[#FAF7F2]">
                  Zero-App Friction
                </h3>
                <p className="text-sm text-[#D1C5B8] leading-relaxed">
                  Guests tap or scan their table QR code. The browser boots in under 300ms with real-time dietary filters, allergen badges, and customizable modifiers.
                </p>
              </Reveal>

              {/* Pillar 2 */}
              <Reveal delay={0.2} className="p-8 rounded-[var(--radius-xl)] bg-[#3B332E] border border-[var(--ember-border)] space-y-4">
                <div className="h-12 w-12 rounded-full bg-[#D97706]/15 flex items-center justify-center text-[#D97706]">
                  <Flame className="h-6 w-6" />
                </div>
                <span className="eyebrow text-[11px] text-[#D1C5B8] font-semibold">
                  03.2 / Realtime Kitchen Line
                </span>
                <h3 className="font-serif text-xl font-bold text-[#FAF7F2]">
                  Instant Kitchen Dispatch
                </h3>
                <p className="text-sm text-[#D1C5B8] leading-relaxed">
                  Paid orders or counter chits sync instantaneously via cryptographic Supabase Realtime channels. No paper slips, no dropped tickets.
                </p>
              </Reveal>

              {/* Pillar 3 */}
              <Reveal delay={0.3} className="p-8 rounded-[var(--radius-xl)] bg-[#3B332E] border border-[var(--ember-border)] space-y-4">
                <div className="h-12 w-12 rounded-full bg-[#D97706]/15 flex items-center justify-center text-[#D97706]">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <span className="eyebrow text-[11px] text-[#D1C5B8] font-semibold">
                  03.3 / Sovereign Payments
                </span>
                <h3 className="font-serif text-xl font-bold text-[#FAF7F2]">
                  Direct Reconciliation
                </h3>
                <p className="text-sm text-[#D1C5B8] leading-relaxed">
                  Pay online via Razorpay with cryptographic webhook verification, or choose Pay at Counter. Sequence-backed order numbers ensure strict auditing.
                </p>
              </Reveal>
            </div>

            {/* Interactive Split Showcase CTA Banner */}
            <Reveal delay={0.2} className="p-8 sm:p-12 rounded-[var(--radius-xl)] bg-gradient-to-r from-[#211B17] via-[#2E2723] to-[#3B332E] border border-[#D97706]/30 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="space-y-2 text-center md:text-left">
                <span className="eyebrow text-[#D97706] font-semibold">
                  Interactive Split Demo
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#FAF7F2]">
                  See the Guest App & Kitchen Board in Action
                </h3>
                <p className="text-sm text-[#D1C5B8] max-w-xl">
                  Open the live split showcase to see an order travel from the mobile guest phone straight onto the chef’s preparation line.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                <Link
                  href="/demo"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-semibold tracking-wider uppercase transition-all shadow-md min-h-[44px]"
                >
                  <span>Open Showcase</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/kitchen"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-[#FAF7F2] text-xs font-semibold tracking-wider uppercase transition-all border border-white/20 min-h-[44px]"
                >
                  <ChefHat className="h-4 w-4" />
                  <span>Kitchen Screen</span>
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 04 / RESERVATIONS & INTALLO PARTNERSHIP */}
        <section className="py-20 sm:py-28 px-4 sm:px-8 max-w-7xl mx-auto w-full">
          <Reveal className="max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2">
              <span className="eyebrow text-[var(--accent)] font-semibold">
                04 / Concept Preview & Inquiries
              </span>
            </div>

            <h2 className="display-subheading text-[var(--text-primary)] font-bold">
              Crafted for Modern Hospitality Brands.
            </h2>

            <p className="text-base text-[var(--text-secondary)] leading-relaxed">
              Masala Lane is a flagship demonstration of DinePulse, built by the hospitality engineers at Intallo. Designed for fine casual dining, cafes, and multi-outlet restaurants across India.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://intallo.in/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold tracking-wider uppercase transition-all shadow-md min-h-[44px]"
              >
                <span>Contact Intallo for DinePulse</span>
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/t/demo-table-7"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-[var(--bg-subtle)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold tracking-wider uppercase transition-all min-h-[44px]"
              >
                <span>Test Demo Table 7</span>
              </Link>
            </div>
          </Reveal>
        </section>
      </div>
    </SmoothScroll>
  );
}
