/**
 * FlinkServe — database seeder
 * ---------------------------------------------------------------------------
 * Populates MongoDB with demo providers, service seekers, services, bookings
 * and reviews so the Browse / Dashboard / Service Details sections have real
 * content to render.
 *
 * Usage:
 *   npm run seed                          # wipe demo collections, then recreate
 *   node scripts/seedDatabase.js --keep   # add without wiping first
 *
 * Safe to run repeatedly: without --keep it clears the collections listed
 * below, then re-inserts. It never drops the database itself.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Review = require('../models/Review');

const KEEP_EXISTING = process.argv.includes('--keep');

const PROVIDERS = [
  {
    name: 'Adaeze Okonkwo',
    email: 'adaeze@flinkserve.com',
    phone: '+2348011110001',
    password: 'Password123',
    role: 'service_provider',
    location: {
      address: '12 Adeola Odeku Street, Victoria Island, Lagos',
      coordinates: { lat: 6.4281, lng: 3.4219 },
      city: 'Lagos',
      state: 'Lagos'
    },
    providerProfile: {
      bio: 'Professional home cleaner with 6 years of experience serving Lagos Island households.',
      skills: ['Deep Cleaning', 'Laundry', 'Organisation'],
      experience: 6,
      hourlyRate: 3500,
      availability: 'full-time',
      serviceRadius: 15,
      isVerified: true
    }
  },
  {
    name: 'Emeka Nwosu',
    email: 'emeka@flinkserve.com',
    phone: '+2348011110002',
    password: 'Password123',
    role: 'service_provider',
    location: {
      address: '45 Allen Avenue, Ikeja, Lagos',
      coordinates: { lat: 6.6018, lng: 3.3515 },
      city: 'Lagos',
      state: 'Lagos'
    },
    providerProfile: {
      bio: 'Certified electrician and plumber. Handles installations, repairs and emergency call-outs.',
      skills: ['Wiring', 'Pipe Fitting', 'Appliance Repair'],
      experience: 9,
      hourlyRate: 5000,
      availability: 'flexible',
      serviceRadius: 25,
      isVerified: true
    }
  },
  {
    name: 'Fatima Bello',
    email: 'fatima@flinkserve.com',
    phone: '+2348011110003',
    password: 'Password123',
    role: 'service_provider',
    location: {
      address: '8 Admiralty Way, Lekki Phase 1, Lagos',
      coordinates: { lat: 6.4406, lng: 3.4855 },
      city: 'Lagos',
      state: 'Lagos'
    },
    providerProfile: {
      bio: 'Mathematics and science tutor for secondary school and university entrance exams.',
      skills: ['Mathematics', 'Physics', 'Exam Prep'],
      experience: 7,
      hourlyRate: 4000,
      availability: 'evenings',
      serviceRadius: 10,
      isVerified: true
    }
  },
  {
    name: 'Tunde Adeyemi',
    email: 'tunde@flinkserve.com',
    phone: '+2348011110004',
    password: 'Password123',
    role: 'service_provider',
    location: {
      address: '23 Opebi Road, Opebi, Lagos',
      coordinates: { lat: 6.5908, lng: 3.3602 },
      city: 'Lagos',
      state: 'Lagos'
    },
    providerProfile: {
      bio: 'Professional photographer specialising in events, portraits and product photography.',
      skills: ['Event Photography', 'Portraits', 'Photo Editing'],
      experience: 5,
      hourlyRate: 25000,
      availability: 'weekends',
      serviceRadius: 40,
      isVerified: false
    }
  }
];

const SEEKERS = [
  {
    name: 'Ngozi Eze',
    email: 'ngozi@flinkserve.com',
    phone: '+2348022220001',
    password: 'Password123',
    role: 'service_seeker',
    location: {
      address: '15 Bourdillon Road, Ikoyi, Lagos',
      coordinates: { lat: 6.4491, lng: 3.4356 },
      city: 'Lagos',
      state: 'Lagos'
    }
  },
  {
    name: 'Ibrahim Musa',
    email: 'ibrahim@flinkserve.com',
    phone: '+2348022220002',
    password: 'Password123',
    role: 'service_seeker',
    location: {
      address: '6 Ozumba Mbadiwe Avenue, Victoria Island, Lagos',
      coordinates: { lat: 6.4278, lng: 3.4176 },
      city: 'Lagos',
      state: 'Lagos'
    }
  }
];
const SERVICES = [
  {
    title: 'Professional Home Deep Cleaning',
    description:
      'Thorough top-to-bottom deep cleaning of your apartment or house. Includes kitchen degreasing, bathroom sanitisation, floor mopping, window cleaning and dusting of all surfaces. Eco-friendly cleaning supplies provided.',
    category: 'Home Cleaning',
    subcategory: 'Deep Cleaning',
    pricing: { type: 'per_visit', amount: 15000, currency: 'NGN' },
    images: [{ url: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800', alt: 'Home cleaning', isPrimary: true }],
    features: ['Eco-friendly products', 'Equipment included', 'Same-day booking', 'Insured'],
    tags: ['cleaning', 'home', 'deep clean'],
    address: '12 Adeola Odeku Street, Victoria Island, Lagos',
    coordinates: { lat: 6.4281, lng: 3.4219 },
    providerIndex: 0
  },
  {
    title: 'Electrical Wiring & Appliance Repair',
    description:
      'Licensed electrician for house wiring, socket installation, fuse box repairs, generator changeover switches and appliance diagnostics. Emergency call-outs available within Lekki and Ikeja.',
    category: 'Electrical',
    subcategory: 'Installation & Repair',
    pricing: { type: 'hourly', amount: 5000, currency: 'NGN' },
    images: [{ url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800', alt: 'Electrical work', isPrimary: true }],
    features: ['Certified electrician', 'Emergency service', 'Warranty on work', 'Free inspection'],
    tags: ['electrical', 'wiring', 'repair'],
    address: '45 Allen Avenue, Ikeja, Lagos',
    coordinates: { lat: 6.6018, lng: 3.3515 },
    providerIndex: 1
  },
  {
    title: 'Plumbing Repairs & Pipe Fitting',
    description:
      'Fixing leaking taps, blocked drains, toilet repairs and new pipe installations. We carry common replacement parts so most jobs are completed in a single visit.',
    category: 'Plumbing',
    subcategory: 'Repairs',
    pricing: { type: 'hourly', amount: 4500, currency: 'NGN' },
    images: [{ url: 'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=800', alt: 'Plumbing', isPrimary: true }],
    features: ['Parts available', 'Same-day service', 'Emergency service'],
    tags: ['plumbing', 'pipes', 'leak'],
    address: '45 Allen Avenue, Ikeja, Lagos',
    coordinates: { lat: 6.6018, lng: 3.3515 },
    providerIndex: 1
  },
  {
    title: 'WAEC & JAMB Mathematics Tutoring',
    description:
      'One-on-one or small-group mathematics tutoring focused on WAEC, NECO and JAMB syllabi. Includes past-question drills, weekly progress reports and mock exams.',
    category: 'Tutoring',
    subcategory: 'Exam Preparation',
    pricing: { type: 'hourly', amount: 4000, currency: 'NGN' },
    images: [{ url: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800', alt: 'Tutoring', isPrimary: true }],
    features: ['Past questions included', 'Progress reports', 'Flexible scheduling', 'Online option'],
    tags: ['tutoring', 'maths', 'waec', 'jamb'],
    address: '8 Admiralty Way, Lekki Phase 1, Lagos',
    {
    title: 'Event & Portrait Photography',
    description:
      'Full-day event coverage or studio-quality portraits. Package includes a professional photographer, edited high-resolution images delivered within 7 days, and a shared online gallery.',
    category: 'Photography',
    subcategory: 'Event Photography',
    pricing: { type: 'per_project', amount: 120000, currency: 'NGN' },
    images: [{ url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800', alt: 'Photography', isPrimary: true }],
    features: ['Edited photos', 'Online gallery', 'Multiple locations', 'Props available'],
    tags: ['photography', 'event', 'portrait'],
    address: '23 Opebi Road, Opebi, Lagos',
    coordinates: { lat: 6.5908, lng: 3.3602 },
    providerIndex: 3
  },
  {
    title: 'Weekly Garden & Lawn Maintenance',
    description:
      'Regular lawn mowing, hedge trimming, weeding and garden waste removal. Subscribe weekly or bi-weekly and keep your compound consistently tidy.',
    category: 'Landscaping',
    subcategory: 'Maintenance',
    pricing: { type: 'per_visit', amount: 20000, currency: 'NGN' },
    images: [{ url: 'https://images.unsplash.com/photo-1558904541-efa843a96f01?w=800', alt: 'Landscaping', isPrimary: true }],
    features: ['Waste removal included', 'Own equipment', 'Recurring discount'],
    tags: ['landscaping', 'garden', 'lawn'],
    address: '12 Adeola Odeku Street, Victoria Island, Lagos',
    coordinates: { lat: 6.4281, lng: 3.4219 },
    providerIndex: 0
  },
  {
    title: 'Personal Fitness Training at Home',
    description:
      'Certified personal trainer delivering tailored strength and conditioning sessions at your home or compound. Includes a nutrition plan and monthly fitness assessment.',
    category: 'Fitness',
    subcategory: 'Personal Training',
    pricing: { type: 'hourly', amount: 8000, currency: 'NGN' },
    images: [{ url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800', alt: 'Fitness training', isPrimary: true }],
    features: ['Nutrition plan', 'Equipment provided', 'Progress tracking'],
    tags: ['fitness', 'training', 'gym'],
    address: '8 Admiralty Way, Lekki Phase 1, Lagos',
    coordinates: { lat: 6.4406, lng: 3.4855 },
    providerIndex: 2
  },
  {
    title: 'Pet Grooming & Day Care',
    description:
      'Gentle grooming for dogs and cats: bathing, brushing, nail trimming and ear cleaning. Day-care packages available for busy owners who travel.',
    category: 'Pet Care',
    subcategory: 'Grooming',
    pricing: { type: 'per_visit', amount: 12000, currency: 'NGN' },
    images: [{ url: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=800', alt: 'Pet grooming', isPrimary: true }],
    features: ['Gentle handling', 'Day care available', 'Pick-up option'],
    tags: ['pets', 'grooming', 'daycare'],
    address: '23 Opebi Road, Opebi, Lagos',
    coordinates: { lat: 6.5908, lng: 3.3602 },
    providerIndex: 3
  }
];

const REVIEW_TEMPLATES = [
  { rating: 5, title: 'Excellent work', comment: 'Arrived on time and did a thorough job. Highly recommended.' },
  { rating: 4, title: 'Very good service', comment: 'Professional and polite. Would book again.' },
  { rating: 5, title: 'Outstanding', comment: 'Went above and beyond expectations. Great value for money.' },
  { rating: 4, title: 'Reliable provider', comment: 'Good communication throughout and finished on schedule.' }
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const buildSchedule = () => {
  const schedule = {};
  DAYS.forEach((day) => {
    const isWeekend = day === 'saturday' || day === 'sunday';
    schedule[day] = isWeekend
      ? { start: '09:00', end: '16:00', available: day === 'saturday' }
      : { start: '08:00', end: '18:00', available: true };
  });
  return schedule;
};