import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AccessDeniedPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="font-display text-2xl font-semibold mb-2">Access denied</h1>
        <p className="text-sm text-muted-foreground mb-8">
          You do not have permission to access this page. Please contact your
          system administrator if you believe this is an error.
        </p>
        <Button asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Return to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
