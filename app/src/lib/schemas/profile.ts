import { z } from 'zod';
import { requiredText } from './common';

export const UpdateProfileInput = z.object({ name: requiredText('Nama', 100) });
