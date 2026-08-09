import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { Features } from '@/components/Features';
import { HowItWorks } from '@/components/HowItWorks';
import { AgentBuilderForm } from '@/components/AgentBuilderForm';
import { FAQ } from '@/components/FAQ';
import { Footer } from '@/components/Footer';

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <AgentBuilderForm />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
