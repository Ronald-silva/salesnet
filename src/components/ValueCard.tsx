import { LucideIcon } from "lucide-react";

interface ValueCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

const ValueCard = ({ icon: Icon, title, description }: ValueCardProps) => {
  return (
    <div className="bg-card rounded-lg p-6 shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1">
      <div className="w-14 h-14 bg-gradient-card rounded-lg flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-secondary" />
      </div>
      <h3 className="text-xl font-heading font-semibold text-card-foreground mb-2">
        {title}
      </h3>
      <p className="text-muted-foreground">
        {description}
      </p>
    </div>
  );
};

export default ValueCard;
