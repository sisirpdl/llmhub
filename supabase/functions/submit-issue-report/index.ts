import { handleSubmission } from './handler.ts';
Deno.serve(request =>
  handleSubmission(request, {
    url: Deno.env.get('SUPABASE_URL') || '',
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    publicKey: Deno.env.get('ISSUE_REPORT_PUBLISHABLE_KEY') || '',
  }),
);
