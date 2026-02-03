// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// --- TYPES ---
interface BattleAction {
    matchId: string;
    type: 'play_basic' | 'attack' | 'end_turn';
    payload: any;
}

// --- CONFIG ---
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''; // Trusted Environment
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req: Request) => {
    // 1. CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
    }

    try {
        // 2. Auth Check
        const authHeader = req.headers.get('Authorization')!
        const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))

        if (authError || !user) {
            throw new Error('Unauthorized');
        }

        // 3. Parse Request
        const { matchId, type, payload } = await req.json() as BattleAction;

        // 4. Fetch Current Game State (Row Locking)
        const { data: match, error: matchError } = await supabase
            .from('matches')
            .select('*')
            .eq('id', matchId)
            .single();

        if (matchError || !match) throw new Error('Match not found');

        const state = match.current_state; // JSONB

        // 5. Validation Logic (The "Anti-Cheat")
        if (state.currentPlayerId !== user.id) {
            throw new Error('Not your turn');
        }

        if (match.status !== 'active') {
            throw new Error('Game is not active');
        }

        // 6. Game Logic Mutation
        let newState = { ...state };

        switch (type) {
            case 'attack':
                // Logic: Calculate Damage
                console.log('Processing Attack...');
                break;

            case 'play_basic':
                // Logic: Move card from Hand -> Bench
                break;

            case 'end_turn':
                // Switch Turn
                break;

            default:
                throw new Error('Unknown action');
        }

        // 7. Update Database (Triggers Realtime Broadcast)
        const { error: updateError } = await supabase
            .from('matches')
            .update({
                current_state: newState,
                updated_at: new Date()
            })
            .eq('id', matchId);

        if (updateError) throw updateError;

        // 8. Log the Move for Replay
        await supabase.from('match_logs').insert({
            match_id: matchId,
            player_id: user.id,
            action_type: type,
            action_payload: payload
        });

        return new Response(JSON.stringify({ success: true, newState }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
    }
})
