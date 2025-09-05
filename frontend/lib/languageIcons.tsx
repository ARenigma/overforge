import {
  SiPython, SiJavascript, SiTypescript, SiCplusplus, SiGo, SiRuby, SiPhp, SiSwift, SiKotlin, SiRust, SiHtml5, SiCss3, SiScala
} from "react-icons/si";
import { FaJava, FaQuestion } from "react-icons/fa";
import { ReactElement } from "react";

export const languageIconMap: Record<string, () => ReactElement> = {
  "python": () => <SiPython color="#3776AB" />,
  "javascript": () => <SiJavascript color="#F7DF1E" />,
  "typescript": () => <SiTypescript color="#3178C6" />,
  "java": () => <FaJava color="#007396" />,
  "c++": () => <SiCplusplus color="#00599C" />,
  "go": () => <SiGo color="#00ADD8" />,
  "ruby": () => <SiRuby color="#CC342D" />,
  "php": () => <SiPhp color="#777BB4" />,
  "swift": () => <SiSwift color="#FA7343" />,
  "kotlin": () => <SiKotlin color="#7F52FF" />,
  "rust": () => <SiRust color="#000000" />,
  "html": () => <SiHtml5 color="#E34F26" />,
  "css": () => <SiCss3 color="#1572B6" />,
  "scala": () => <SiScala color="#DC322F" />,
};

export function getLanguageIcon(languageName: string) {
  const key = languageName.toLowerCase();
  for (const lang in languageIconMap) {
    if (key.includes(lang)) return languageIconMap[lang]();
  }
  return <FaQuestion color="#BDBDBD" />;
} 