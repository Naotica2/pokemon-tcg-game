import { supabase } from './supabaseClient';

export default class DataSeeder {
    private static BASE_URL = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards/A1.json';

    // Using TCGDex for reliable images
    private static IMAGE_BASE_URL = 'https://assets.tcgdex.net/en/tcgp/A1/';

    public static async seedGeneticApex() {
        console.log("Starting Seed Process (Source: TCGDex Images)...");
        try {
            // 1. Fetch JSON (Still using Flibustier for metadata/rarity)
            const response = await fetch(this.BASE_URL);
            if (!response.ok) throw new Error(`Failed to fetch JSON: ${response.statusText}`);
            const data = await response.json();

            console.log(`Fetched ${data.length} cards.`);

            // 2. Transform Data
            const cardsToInsert = data.map((card: any) => {
                // Map Rarity
                let rarity = 'common';
                const r = card.rarity;

                if (r === 'C') rarity = 'common';
                else if (r === 'U') rarity = 'uncommon';
                else if (r === 'R') rarity = 'rare';
                else if (r === 'RR') rarity = 'double_rare';
                else if (['AR', 'SR', 'SAR', 'UR', 'IM'].includes(r)) rarity = 'illustration_rare';

                // Construct Image URL using TCGDex logic
                // Format: https://assets.tcgdex.net/en/tcgp/A1/{001}/high.png
                const paddedNum = String(card.number).padStart(3, '0');
                const image_url = `${this.IMAGE_BASE_URL}${paddedNum}/high.png`;

                return {
                    id: `${card.set}-${String(card.number).padStart(3, '0')}`,
                    set_id: card.set,
                    name: card.name,
                    rarity: rarity,
                    type: 'Pokemon',
                    hp: 0,
                    stage: 'Basic',
                    image_url: image_url
                };
            });

            console.log("First card preview:", cardsToInsert[0]);

            // 3. Upsert to Supabase
            const batchSize = 50;
            for (let i = 0; i < cardsToInsert.length; i += batchSize) {
                const batch = cardsToInsert.slice(i, i + batchSize);
                const { error } = await supabase.from('cards').upsert(batch, { onConflict: 'id' });
                if (error) throw error;
            }

            console.log("Seeding Complete!");
            return { success: true, count: cardsToInsert.length };

        } catch (e: any) {
            console.error("Seeding Failed:", e);
            return { success: false, error: e.message || JSON.stringify(e) };
        }
    }
}
