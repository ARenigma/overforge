import { createContext, useContext, useState } from "react";

const InterviewContext = createContext();

export function InterviewProvider({ children }) {
  const [interviewInfo, setInterviewInfo] = useState(null);

  const setInfo = (info) => setInterviewInfo(info);
  const clearInfo = () => setInterviewInfo(null);

  return (
    <InterviewContext.Provider value={{ interviewInfo, setInterviewInfo: setInfo, clearInterviewInfo: clearInfo }}>
      {children}
    </InterviewContext.Provider>
  );
}

export function useInterview() {
  return useContext(InterviewContext);
} 