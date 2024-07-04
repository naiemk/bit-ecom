'use client'

import { useAtom } from "jotai";
import { useEffect } from "react";
import { config, configInit } from "./store/global";
import { Card, CardHeader } from "@nextui-org/card";
import { CircularProgress } from "@nextui-org/progress";

export function Init() {
	const [conf, setConfig] = useAtom(config);
  useEffect(() => {
    configInit(setConfig).catch(console.error);
  }, [setConfig]);

  if (conf.state === 'hasError') {
    return (
	    <Card className="max-w-[400px]">
        <CardHeader className="flex gap-3">
          {conf.error.toString()}
        </CardHeader>
      </Card>
    )
  }
  if (conf.state === 'loading') {
    return (<CircularProgress aria-label="Loading..." />);
  }
  return (<></>)
}