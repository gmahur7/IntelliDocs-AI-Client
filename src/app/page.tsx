import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div>
      <ModeToggle />
      <Button className="text-primary">dndo</Button>
    </div>
  );
}
