import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Eye,
  Heart,
  MessageCircle,
  PackageCheck,
  Shirt,
  Sparkles,
  Store,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Why AIShelf | Built for independent clothing brands",
  description: "A practical guide to helping online-first clothing brands make their product information easier to find, understand, and trust.",
};

const challenges = [
  {
    icon: Store,
    title: "No fitting room on the corner",
    description: "Customers cannot feel a fabric, try on a size, or ask a sales associate for advice before ordering. Your product page has to do more of that explaining.",
  },
  {
    icon: Eye,
    title: "Big brands start with recognition",
    description: "Established retailers bring familiar names, large ad budgets, and years of visibility. A great independent label can be harder to discover in a crowded online choice set.",
  },
  {
    icon: MessageCircle,
    title: "Shopping is becoming conversational",
    description: "Customers increasingly ask digital assistants what to wear, what fits, or which brands match their needs. It helps when the details they need are easy to find and accurate.",
  },
];

const steps = [
  {
    number: "01",
    title: "Bring your product details together",
    text: "Keep your descriptions, sizing, materials, pricing, and product imagery organized as the verified source of truth for your catalog.",
    icon: Shirt,
  },
  {
    number: "02",
    title: "See what the sample says",
    text: "Review recorded shopping questions and responses. See where your brand appeared, which competitors were mentioned, and what product claims may need a closer look.",
    icon: Eye,
  },
  {
    number: "03",
    title: "Make a practical next move",
    text: "Turn evidence into owner-reviewed actions: improve a product detail, verify a claim, or investigate a missed mention. You choose what changes.",
    icon: PackageCheck,
  },
];

export default function WhyAishelfPage() {
  return (
    <main className="why-page">
      <header className="why-header">
        <Link className="brand-mark why-brand" href="/" aria-label="AIShelf workspace">
          <span className="brand-symbol"><span /></span>
          <span>ai<span className="brand-light">shelf</span></span>
        </Link>
        <nav aria-label="Page navigation">
          <a href="#why-now">Why online brands</a>
          <a href="#how-it-helps">How it helps</a>
          <a href="#what-it-isnt">What it isn’t</a>
        </nav>
        <Link className="button primary why-header-cta" href="/">Open your workspace <ArrowRight size={15} /></Link>
      </header>

      <section className="why-hero">
        <div className="why-hero-copy">
          <span className="why-overline"><span /> FOR THE NEXT GENERATION OF CLOTHING LABELS</span>
          <h1>Small brand.<br />Big <em>point of view.</em></h1>
          <p className="why-hero-lede">Your clothes deserve to be found—not just by people who already know your name.</p>
          <p className="why-hero-body">AIShelf helps online-first clothing brands understand how their products are represented in AI shopping experiences, and make the information behind each product easier to discover, understand, and trust.</p>
          <div className="why-hero-actions">
            <Link className="button primary why-main-cta" href="/">Explore the AIShelf workspace <ArrowRight size={16} /></Link>
            <a className="why-scroll-link" href="#why-now">Why this matters <ArrowDown size={14} /></a>
          </div>
          <div className="why-trust-line"><BadgeCheck size={15} /> Evidence first. Your decisions stay yours.</div>
        </div>
        <div className="why-hero-art" aria-label="Illustration of an independent clothing collection" role="img">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-note note-top"><span className="note-dot" /> YOUR BRAND, IN THE MIX</div>
          <div className="lookbook-card">
            <div className="lookbook-top"><span>THE EVERYDAY EDIT</span><span>01 / 04</span></div>
            <div className="lookbook-visual">
              <div className="sun-disc" />
              <div className="clothing-shape"><span /><i /><b /></div>
              <div className="clothing-shadow" />
            </div>
            <div className="lookbook-caption"><div><span>THE FORM</span><strong>Easy layers, made to last.</strong></div><span className="lookbook-price">$68</span></div>
            <div className="lookbook-tags"><span>Organic cotton</span><span>Relaxed fit</span><span>Made in small runs</span></div>
          </div>
          <div className="art-note note-bottom"><Sparkles size={14} /> DETAILS THAT HELP YOU STAND OUT</div>
          <div className="floating-sticker"><Heart size={14} fill="currentColor" /><span>Independent<br />by design</span></div>
        </div>
        <div className="hero-bottom-label"><span>01</span> A MORE LEVEL PLAYING FIELD STARTS WITH BEING UNDERSTOOD</div>
      </section>

      <section className="why-problem-section" id="why-now">
        <div className="why-section-intro">
          <span className="why-overline dark-overline">THE REALITY OF SELLING ONLINE</span>
          <h2>You’re not just selling a shirt.<br /><em>You’re earning trust at a distance.</em></h2>
          <p>Independent clothing brands often build a whole business online. That gives you reach, but it also removes the in-person moments that help shoppers feel confident about a new label.</p>
        </div>
        <div className="challenge-grid">
          {challenges.map(({ icon: Icon, title, description }, index) => (
            <article className="challenge-card" key={title}>
              <span className="challenge-index">0{index + 1}</span>
              <span className="challenge-icon"><Icon size={19} /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className="why-callout"><span className="callout-mark">“</span><p>When shoppers can’t try it on in person, <strong>clear, useful product information becomes part of the experience.</strong></p></div>
      </section>

      <section className="why-help-section" id="how-it-helps">
        <div className="why-section-intro help-intro">
          <span className="why-overline"><span /> A USEFUL TOOL, NOT ANOTHER PROMISE</span>
          <h2>Turn what’s being said<br />into <em>what to do next.</em></h2>
          <p>AIShelf is designed to make the invisible parts of online product discovery a little more concrete. Start with actual observations, then decide what deserves your attention.</p>
        </div>
        <div className="why-steps">
          {steps.map(({ number, title, text, icon: Icon }) => (
            <article className="why-step" key={number}>
              <div className="step-top"><span>{number}</span><span className="step-icon"><Icon size={18} /></span></div>
              <h3>{title}</h3>
              <p>{text}</p>
              {number === "02" && <div className="step-metric"><span>Sampled brand mentions</span><strong>See the evidence <ArrowRight size={13} /></strong><div><i /><i /><i className="quiet" /><i /></div></div>}
            </article>
          ))}
        </div>
        <div className="why-score-explainer"><div className="score-explainer-icon"><BarChart3 size={18} /></div><div><strong>A diagnostic, not a judgment.</strong><span>AIShelf scores are calculated from recorded evidence. They are not platform ratings, market-share estimates, or promises of sales growth.</span></div><Link href="/">See the scorecard <ArrowRight size={14} /></Link></div>
      </section>

      <section className="why-values-section">
        <div className="values-copy"><span className="why-overline dark-overline">MADE FOR THE DETAILS THAT MAKE YOU, YOU</span><h2>Your difference is<br />in the <em>details.</em></h2><p>Fit notes, fabric, construction, sizing, care, and the story behind a piece can help the right shopper understand why it belongs in their wardrobe.</p></div>
        <div className="value-list">
          <div><span>01</span><p><strong>Make fit easier to understand.</strong> Clear garment measurements and model sizing can help shoppers make more informed choices.</p></div>
          <div><span>02</span><p><strong>Bring materials to the front.</strong> Explain texture, weight, stretch, and care—not just the product name.</p></div>
          <div><span>03</span><p><strong>Let the story travel with the product.</strong> Consistent details give people and shopping tools better context about your brand.</p></div>
          <div><span>04</span><p><strong>Spend time where it counts.</strong> Find specific gaps and verify them before you update product information.</p></div>
        </div>
      </section>

      <section className="why-boundary-section" id="what-it-isnt">
        <div className="boundary-heading"><span className="why-overline dark-overline">HONEST ABOUT THE LIMITS</span><h2>Helpful visibility.<br /><em>No magic buttons.</em></h2></div>
        <div className="boundary-grid">
          <div><span className="boundary-symbol">01</span><strong>Not a replacement for trying it on</strong><p>Product details can set better expectations, but they cannot recreate touch, fit, or personal styling in a store.</p></div>
          <div><span className="boundary-symbol">02</span><strong>Not a guarantee of being recommended</strong><p>AI shopping experiences vary. One sample does not explain every answer, platform, or shopper journey.</p></div>
          <div><span className="boundary-symbol">03</span><strong>Not a substitute for your own judgment</strong><p>Review findings, check verified product information, and approve changes yourself. AIShelf does not publish them.</p></div>
        </div>
      </section>

      <section className="why-cta-section">
        <div className="cta-orb" />
        <span className="why-overline"><span /> YOUR BRAND HAS A PLACE IN THE CONVERSATION</span>
        <h2>Make it easier for the<br /><em>right people to find you.</em></h2>
        <p>Start by bringing your products and the evidence you have into one clear view.</p>
        <Link className="button cta-light-button" href="/">Explore AIShelf <ArrowRight size={15} /></Link>
        <span className="cta-footnote">Built for online-first clothing brands. Grounded in evidence. Designed for people.</span>
      </section>

      <footer className="why-footer"><Link className="brand-mark why-brand" href="/"><span className="brand-symbol"><span /></span><span>ai<span className="brand-light">shelf</span></span></Link><span>Made for the brands making their own way.</span><Link href="/">Open workspace <ArrowRight size={13} /></Link></footer>
    </main>
  );
}
