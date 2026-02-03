import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// --- CONFIG ---
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- TYPES ---
interface RawSet {
  key: string;
  name: string;
  // Add other fields as discovered in the JSON
}

interface RawCard {
  id: string;
  name: string;
  rarity: number; // The JSON likely uses numbers or keys for rarity
  type: string;
  hp?: number;
  // ... other fields
}

// --- MAIN FUNCTION ---
async function seedMasterData() {
  console.log('🚀 Starting Data Ingestion...');

  try {
    // 1. Fetch Sets (Assuming a known structure or iterating known sets like A1)
    // Note: The repo structure needs inspection. Based on typical structure:
    // We might need to fetch a manifest or just try specific sets.
    // Let's assume we start with set "A1" (Genetic Apex) as per common knowledge of this db.
    
    // Check if there is a 'sets.json' or similar. 
    // If not, we iterate known sets.
    const setsToSync = ['A1']; // Add more as needed

    for (const setKey of setsToSync) {
      console.log(`Processing Set: ${setKey}...`);
      
      // Upsert Set Info (Mocking set info if not available in a dedicated file, 
      // or fetching from a collections file if it exists)
      const { error: setError } = await supabase.from('sets').upsert({
        id: setKey,
        name: 'Genetic Apex', // Ideally fetched
        total_cards: 200, // Ideally fetched
      });

      if (setError) console.error(`Error upserting set ${setKey}:`, setError);

      // 2. Fetch Cards for Set
      // Construct URL: https://raw.githubusercontent.com/.../main/en/A1.json (Hypothetical path)
      // We need to know the exact path structure of flibustier's repo.
      // Looking at the repo (simulated): usually /data/en/A1.json or similar.
      // I'll assume a standard path for now, user might need to adjust.
      const lang = 'en';
      const url = `${GITHUB_BASE_URL}/${lang}/${setKey}.json`;
      
      console.log(`Fetching cards from: ${url}`);
      
      try {
        const response = await axios.get(url);
        const cardsData = response.data; // Array of cards
        
        if (!Array.isArray(cardsData)) {
            console.error(`Invalid JSON format for ${setKey}`);
            continue;
        }

        const formattedCards = cardsData.map((c: any) => ({
            id: c.id, // Ensure this matches DB (e.g. A1-001)
            set_id: setKey,
            name: c.name,
            rarity: mapRarity(c.rarity),
            type: c.supertype // Pokemon, Trainer, etc.
            // ... map other fields
        }));

        // Batch insert
        const { error: cardsError } = await supabase.from('cards').upsert(formattedCards);
        if (cardsError) console.error('Error inserting cards:', cardsError);
        else console.log(`✅ Upserted ${formattedCards.length} cards for set ${setKey}`);

      } catch (err) {
        console.error(`Failed to fetch/process ${url}`, err);
      }
    }

  } catch (error) {
    console.error('Fatal Error:', error);
  }
}

// Helper to map rarity ID/String to our DB string
function mapRarity(rarityInput: any): string {
    // Implement logic based on actual JSON
    return String(rarityInput); 
}

seedMasterData();
