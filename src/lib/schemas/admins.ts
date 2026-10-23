import { accountSchema } from './install';

/** A new admin user: the same rules as the account created by the install wizard. */
export const createAdminSchema = accountSchema;
