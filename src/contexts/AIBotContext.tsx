import { createContext, useContext } from "react";

interface AIBotContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const AIBotContext = createContext<AIBotContextType>({
  isOpen: false,
  setIsOpen: () => {},
});

export const useAIBot = () => useContext(AIBotContext);
