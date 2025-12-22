import { useEffect, useState } from "react";
import { nanoid } from "nanoid";

import { ANIMALS, STORAGE_KEY } from "@/constants";

const generateUsername = () => {
  const animal =
    ANIMALS[Math.floor(Math.random() * ANIMALS.length)].toLowerCase();
  return `anonymous-${animal}-${nanoid(5)}`;
};

export const useUsername = () => {
  const [username, setUsername] = useState<string>("");

  useEffect(() => {
    const getUsername = () => {
      let storedUsername = localStorage.getItem(STORAGE_KEY);

      if (storedUsername) {
        setUsername(storedUsername);
        return;
      }

      storedUsername = generateUsername();

      localStorage.setItem(STORAGE_KEY, storedUsername);

      setUsername(storedUsername);
    };

    getUsername();
  }, []);

  return username;
};
