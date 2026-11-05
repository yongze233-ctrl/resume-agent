import { installFrontendReporting } from '@/lib/diagnostics/frontend';
// Run before hydration so bootstrap/chunk failures are observable too.
installFrontendReporting();
