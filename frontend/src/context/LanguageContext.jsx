import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { html } from "@codemirror/lang-html";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { go } from "@codemirror/lang-go";
import { php } from "@codemirror/lang-php";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { css } from "@codemirror/lang-css";
// ...import more as needed

const extensionMap = {
  "JavaScript (Node.js)": javascript,
  "Python (3.8.1)": python,
  "Python 3": python,
  "C++ (GCC 9.2.0)": cpp,
  "Java (OpenJDK 13.0.1)": java,
  "HTML (5.0)": html,
  "Rust (1.40.0)": rust,
  "SQL (SQLite 3.27.2)": sql,
  "Go (1.13.1)": go,
  "PHP (7.4.1)": php,
  "Markdown": markdown,
  "JSON (runjson)": json,
  "XML": xml,
  "CSS (CSS 3.0)": css,
  // ...add more mappings as needed
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [languages, setLanguages] = useState([]);
  useEffect(() => {
    axios
      .get("/api/languages")
      .then((res) => setLanguages(res.data.languages))
      .catch(() =>
        setLanguages([
          { id: 63, name: "JavaScript (Node.js)" },
          { id: 71, name: "Python 3" },
          { id: 54, name: "C++ (GCC 9.2.0)" },
          { id: 62, name: "Java (OpenJDK 13.0.1)" },
        ])
      );
  }, []);
  return (
    <LanguageContext.Provider value={{ languages, extensionMap }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguages() {
  return useContext(LanguageContext);
} 