"use client"

import { useNotification } from "@/app/(app)/context"
import { uploadFilesAction } from "@/app/(app)/files/actions"
import { ImageCropModal } from "@/components/files/image-crop-modal"
import { Button } from "@/components/ui/button"
import { useCropQueue } from "@/hooks/use-crop-queue"
import config from "@/lib/config"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { ComponentProps, startTransition, useCallback, useRef, useState } from "react"
import { FormError } from "../forms/error"

export function UploadButton({ children, ...props }: { children: React.ReactNode } & ComponentProps<typeof Button>) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState("")
  const [isUploading, setIsUploading] = useState(false)

  const doUpload = useCallback(
    async (files: File[]) => {
      setIsUploading(true)
      const formData = new FormData()
      for (const file of files) formData.append("files", file)
      startTransition(async () => {
        const result = await uploadFilesAction(formData)
        if (result.success) {
          showNotification({ code: "sidebar.unsorted", message: "new" })
          setTimeout(() => showNotification({ code: "sidebar.unsorted", message: "" }), 3000)
          router.push("/unsorted")
        } else {
          setUploadError(result.error ?? "Something went wrong...")
        }
        setIsUploading(false)
      })
    },
    [router, showNotification]
  )

  const { startQueue, confirmCurrent, skipCurrent, currentFile, currentIndex, totalFiles } = useCropQueue()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError("")
    if (!e.target.files || e.target.files.length === 0) return
    const files = Array.from(e.target.files)
    startQueue(files, doUpload)
    e.target.value = ""
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault()
    fileInputRef.current?.click()
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        id="fileInput"
        className="hidden"
        multiple
        accept={config.upload.acceptedMimeTypes}
        onChange={handleFileChange}
      />

      <Button onClick={handleButtonClick} disabled={isUploading} type="button" {...props}>
        {isUploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>{children}</>
        )}
      </Button>

      {uploadError && <FormError>{uploadError}</FormError>}

      {currentFile && (
        <ImageCropModal
          file={currentFile}
          index={currentIndex}
          total={totalFiles}
          onConfirm={confirmCurrent}
          onSkip={skipCurrent}
        />
      )}
    </div>
  )
}
