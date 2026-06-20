import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typography';

export default function Home() {
  return (
    <div>
      <Typography variant={'body'} color={'destructive'}>
        Hello
      </Typography>
      <ModeToggle />
      <Button className="text-primary">dndo</Button>
    </div>
  );
}
