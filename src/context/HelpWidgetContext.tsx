import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  getHelpWidgetOpen,
  setHelpWidgetOpen as persistOpen,
  getHelpActiveTab,
  setHelpActiveTab as persistTab,
  getWizardStep,
  setWizardStep as persistStep,
  isStepDone,
  setStepDone as persistStepDone,
  isHelpWidgetHiddenForever,
  setHelpWidgetHiddenForever as persistHiddenForever,
  type HelpTab,
  type SetupStepId,
} from "../lib/helpWidgetStorage";

type HelpWidgetContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  activeTab: HelpTab;
  setActiveTab: (t: HelpTab) => void;
  wizardStep: SetupStepId;
  setWizardStep: (s: SetupStepId) => void;
  isStepDone: (id: string) => boolean;
  setStepDone: (id: string, done: boolean) => void;
  hiddenForever: boolean;
  setHiddenForever: (v: boolean) => void;
};

const HelpWidgetContext = createContext<HelpWidgetContextValue | null>(null);

export function HelpWidgetProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const [activeTab, setActiveTabState] = useState<HelpTab>("setup");
  const [wizardStep, setWizardStepState] = useState<SetupStepId>("welcome");
  const [hiddenForever, setHiddenForeverState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [stepDoneVersion, setStepDoneVersion] = useState(0);

  useEffect(() => {
    setOpenState(getHelpWidgetOpen());
    setActiveTabState(getHelpActiveTab());
    setWizardStepState(getWizardStep());
    setHiddenForeverState(isHelpWidgetHiddenForever());
    setHydrated(true);
  }, []);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    persistOpen(v);
  }, []);

  const setActiveTab = useCallback((t: HelpTab) => {
    setActiveTabState(t);
    persistTab(t);
  }, []);

  const setWizardStep = useCallback((s: SetupStepId) => {
    setWizardStepState(s);
    persistStep(s);
  }, []);

  const setStepDone = useCallback((id: string, done: boolean) => {
    persistStepDone(id, done);
    setStepDoneVersion((v) => v + 1);
  }, []);

  const isStepDoneRead = useCallback((id: string) => isStepDone(id), [stepDoneVersion]);

  const setHiddenForever = useCallback((v: boolean) => {
    setHiddenForeverState(v);
    persistHiddenForever(v);
  }, []);

  const value: HelpWidgetContextValue = {
    open,
    setOpen,
    activeTab,
    setActiveTab,
    wizardStep,
    setWizardStep,
    isStepDone: isStepDoneRead,
    setStepDone,
    hiddenForever,
    setHiddenForever,
  };

  return (
    <HelpWidgetContext.Provider value={value}>
      {children}
    </HelpWidgetContext.Provider>
  );
}

export function useHelpWidget(): HelpWidgetContextValue {
  const ctx = useContext(HelpWidgetContext);
  if (!ctx) throw new Error("useHelpWidget must be used within HelpWidgetProvider");
  return ctx;
}

export function useHelpWidgetOptional(): HelpWidgetContextValue | null {
  return useContext(HelpWidgetContext);
}
