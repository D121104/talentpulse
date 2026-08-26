import { Navigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import HeroSection from '../components/landing/HeroSection';
import PartnersMarquee from '../components/landing/PartnersMarquee';
import JobCategories from '../components/landing/JobCategories';
import HowItWorks from '../components/landing/HowItWorks';
import AIFeatures from '../components/landing/AIFeatures';
import FeaturedJobs from '../components/landing/FeaturedJobs';
import PremiumPlans from '../components/landing/PremiumPlans';
import Testimonials from '../components/landing/Testimonials';
import CTABanner from '../components/landing/CTABanner';
import { useAuth } from '../auth/AuthContext';

export default function LandingPage() {
  const { user } = useAuth();

  // HR users are restricted to the employer dashboard portal
  if (user?.role === 'HR') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-slate-950 font-sans">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <PartnersMarquee />
        <JobCategories />
        <HowItWorks />
        <AIFeatures />
        <FeaturedJobs />
        <PremiumPlans />
        <Testimonials />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}

