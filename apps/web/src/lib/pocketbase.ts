import PocketBase from 'pocketbase';
import { POCKETBASE_URL } from '$app/env/public';

export const pb = new PocketBase(POCKETBASE_URL);
